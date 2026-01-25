import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import axios from "axios";
import type { FastifyInstance } from "fastify";

const execPromise = promisify(exec);

import { getLogger } from "@/utils/trace-context";
import type { CdnUpdaterService } from "./type";

// Configuring GitHub SSH is required before using this service
class JsDelivrService implements CdnUpdaterService {
	private readonly localPath: string;
	private readonly remoteAddr: string;
	private readonly gitName: string;
	private readonly gitEmail: string;

	private constructor(private fastify: FastifyInstance) {
		const { localPath, remoteAddr, git } = fastify.config.cdn?.jsDelivr ?? {};
		const { name, email } = git ?? {};
		if (!localPath || !remoteAddr) {
			throw new Error("Invalid jsDelivr config");
		}
		this.localPath = localPath;
		this.remoteAddr = remoteAddr;
		this.gitName = name ?? "";
		this.gitEmail = email ?? "";
	}

	static async create(fastify: FastifyInstance) {
		const instance = new JsDelivrService(fastify);
		return instance;
	}

	/**
	 * Get logger, prioritized to use the one with traceId
	 */
	private get log() {
		return getLogger() ?? this.fastify.log;
	}

	// Configure git locally for the repository
	private async configureGit(repoPath: string) {
		if (this.gitName) {
			await execPromise(
				`cd "${repoPath}" && git config user.name "${this.gitName}"`,
			);
		}
		if (this.gitEmail) {
			await execPromise(
				`cd "${repoPath}" && git config user.email "${this.gitEmail}"`,
			);
		}
	}

	parseRepoInfo(remoteAddr: string) {
		// Support both SSH and HTTPS github URLs
		const cleanAddr = remoteAddr.replace(/\.git$/, "");
		const match = cleanAddr.match(/github\.com[:/]([^/]+)\/([^/]+)$/);

		if (!match) {
			throw new Error(`Invalid github remote address: ${remoteAddr}`);
		}
		const [_, namespace, projectName] = match;
		return { namespace, projectName };
	}

	// Update content to branchName under localPath. Directory structure: localPath/fileName. Push to remote repository.
	async update(branchName: string, fileName: string, content: string) {
		const localPath = this.localPath;
		const remoteAddr = this.remoteAddr;

		// 1. Check if localPath exists
		const resolvedLocalPath = path.resolve(localPath);
		if (!fs.existsSync(resolvedLocalPath)) {
			// Clone from remote if it doesn't exist
			this.log.info(
				`Local path "${resolvedLocalPath}" does not exist, cloning remote repository`,
			);
			await execPromise(`git clone "${remoteAddr}" "${resolvedLocalPath}"`);
		}

		// Ensure git config is set for this repository
		await this.configureGit(resolvedLocalPath);

		// Fetch latest info from remote
		await execPromise(`cd "${resolvedLocalPath}" && git fetch origin`);

		// Check if branchName exists locally. Create and pull if not; create if it doesn't exist remotely.
		try {
			// Check if branch exists locally
			await execPromise(
				`cd "${resolvedLocalPath}" && git rev-parse --verify "${branchName}"`,
			);
			// Branch exists, switch to it
			this.log.info(`Branch "${branchName}" exists locally, switching to it`);
			await execPromise(
				`cd "${resolvedLocalPath}" && git checkout "${branchName}"`,
			);
			// Pull latest changes
			try {
				await execPromise(
					`cd "${resolvedLocalPath}" && git pull origin "${branchName}"`,
				);
			} catch (_e) {
				this.log.warn(
					`Failed to pull ${branchName}, might be new local branch or divergence`,
				);
			}
		} catch (_error) {
			// Branch doesn't exist locally, check if it exists remotely
			try {
				await execPromise(
					`cd "${resolvedLocalPath}" && git rev-parse --verify "origin/${branchName}"`,
				);
				// Branch exists remotely, check it out
				this.log.info(
					`Branch "${branchName}" exists remotely, checking it out`,
				);
				await execPromise(
					`cd "${resolvedLocalPath}" && git checkout -b "${branchName}" "origin/${branchName}"`,
				);
			} catch (_remoteError) {
				// Branch doesn't exist remotely either, create it
				// TODO: Clear main branch, create a new branch based on a blank branch
				this.log.info(`Branch "${branchName}" does not exist, creating it`);
				await execPromise(
					`cd "${resolvedLocalPath}" && git checkout -b "${branchName}"`,
				);
			}
		}

		const resolvedFilePath = path.join(resolvedLocalPath, fileName);

		// Check if file exists
		if (!fs.existsSync(resolvedFilePath)) {
			fs.writeFileSync(resolvedFilePath, "");
		}

		// 3. Generate version tag using timestamp for better uniqueness and simpler logic
		const now = new Date();
		// Format: YYYYMMDDHHmmss
		const timestamp = now.toISOString().replace(/[-T:]/g, "").split(".")[0];
		const versionTag = `${fileName}-${timestamp}`;

		// Write the content to the file
		fs.writeFileSync(resolvedFilePath, content);

		// 5. Write content to file and commit via git
		await this.gitAddCommitAndPush(
			resolvedLocalPath,
			resolvedFilePath,
			versionTag,
		);

		const { namespace, projectName } = this.parseRepoInfo(remoteAddr);

		const relativeFilePath = path.relative(resolvedLocalPath, resolvedFilePath);
		// 7. Manually purge jsDelivr cache
		await this.purgeJsDelivrCache(
			namespace,
			projectName,
			relativeFilePath,
			branchName,
		);

		return {
			url: this.getCdnAddr(
				namespace,
				projectName,
				relativeFilePath,
				branchName,
			),
		};
	}

	private async gitAddCommitAndPush(
		localPath: string,
		filePath: string,
		versionTag: string,
	): Promise<void> {
		// Make sure both paths are resolved to absolute paths
		const resolvedLocalPath = path.resolve(localPath);
		const resolvedFilePath = path.resolve(filePath);

		// Get the path relative to the repository root for git operations
		const relativeFilePath = path.relative(resolvedLocalPath, resolvedFilePath);

		// Add file to git using the relative path
		await execPromise(
			`cd "${resolvedLocalPath}" && git add "${relativeFilePath}"`,
		);

		// Check if there are changes to commit
		const { stdout: statusOutput } = await execPromise(
			`cd "${resolvedLocalPath}" && git status --porcelain`,
		);
		if (statusOutput.trim() === "") {
			this.log.info("No changes to commit");
			return;
		}

		// Commit with version tag message
		await execPromise(
			`cd "${resolvedLocalPath}" && git commit -m "update: ${versionTag}"`,
		);

		// Push to remote repository
		await execPromise(`cd "${resolvedLocalPath}" && git push origin HEAD`);

		// Note: Tagging every update creates too much noise and is removed.
		// If version tracking is needed, consider a different strategy.
	}

	private async purgeJsDelivrCache(
		namespace: string,
		projectName: string,
		relativeFilePath: string,
		branchName: string,
	): Promise<void> {
		// Using jsDelivr purge API
		const url = `https://purge.jsdelivr.net/gh/${namespace}/${projectName}@${branchName}/${relativeFilePath}`;
		this.log.info(`Purging jsDelivr cache: ${url}`);

		try {
			const res = await axios.get(url, { timeout: 10000 });
			// Check if returning data contains 'finished'
			const data =
				typeof res.data === "string" ? res.data : JSON.stringify(res.data);
			if (data.includes("finished") || res.data?.status === "finished") {
				this.log.info(`jsDelivr cache purge completed: ${url}`);
			} else {
				throw new Error(
					`jsDelivr cache purge failed: ${url}, response: ${data}`,
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`jsDelivr cache purge failed: ${url}, error: ${message}`);
		}
	}

	private getCdnAddr(
		namespace: string,
		projectName: string,
		relativeFilePath: string,
		branchName: string,
	) {
		const url = `https://cdn.jsdelivr.net/gh/${namespace}/${projectName}@${branchName}/${relativeFilePath}`;
		return url;
	}

	async verifyContentUpdate(url: string, content: string) {
		// Check if content is available via jsDelivr
		this.log.info(`Verifying content update: ${url}`);

		try {
			const res = await axios.get(url, {
				responseType: "text",
				timeout: 10000,
			});
			const remoteContent = res.data;

			if (remoteContent !== content) {
				this.log.warn(
					{
						url,
						expectedLen: content,
						gotLen: remoteContent,
					},
					"Content verification failed: content mismatch",
				);
				return false;
			}
			return true;
		} catch (error) {
			this.log.warn(`Failed to verify content update for ${url}: ${error}`);
			return false;
		}
	}
}

export default JsDelivrService;
