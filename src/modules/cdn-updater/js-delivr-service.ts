import axios from "axios";
import { exec } from "child_process";
import type { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execPromise = promisify(exec);

import { getLogger } from "@/utils/trace-context";
import type { CdnUpdaterService, UploadResult } from "./type";

// 使用这个服务前需要配置github ssh
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
	 * 获取 logger，优先使用带 traceId 的 logger
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
		// 解析github远程仓库的用户名和项目名 eg：git@github.com:gaoxiao6331/cdn-test.git
		const match = remoteAddr.match(/git@github.com:([^/]+)\/([^/]+)\.git$/);
		if (!match) {
			throw new Error("Invalid github remote address");
		}
		const [_, namespace, projectName] = match;
		return { namespace, projectName };
	}

	// 把content更新到localPath下的branchName分支，目录结构为localPath/fileName，并推送到远程仓库
	async update(branchName: string, fileName: string, content: string) {
		const localPath = this.localPath;
		const remoteAddr = this.remoteAddr;

		// 1. 检查localPath是否存在
		const resolvedLocalPath = path.resolve(localPath);
		if (!fs.existsSync(resolvedLocalPath)) {
			// 不存在从远程拉取
			this.log.info(
				`Local path "${resolvedLocalPath}" does not exist, cloning remote repository`,
			);
			await execPromise(`git clone "${remoteAddr}" "${resolvedLocalPath}"`);
		}

		// Ensure git config is set for this repository
		await this.configureGit(resolvedLocalPath);

		// 检查本地是否存在branchName分支，不存在创建去远程拉取，远程不存在则创建
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
		} catch (error) {
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
			} catch (remoteError) {
				// Branch doesn't exist remotely either, create it
				// TODO 清空main分支，基于空白分支创建新分支
				this.log.info(`Branch "${branchName}" does not exist, creating it`);
				await execPromise(
					`cd "${resolvedLocalPath}" && git checkout -b "${branchName}"`,
				);
			}
		}

		const resolvedFilePath = path.join(resolvedLocalPath, fileName);

		// 检查文件是否存在
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

		// 5. 将content的内容写入文件，通过git 提交，内容为"update: {版本号}"
		await this.gitAddCommitAndPush(
			resolvedLocalPath,
			resolvedFilePath,
			versionTag,
		);

		const { namespace, projectName } = this.parseRepoInfo(remoteAddr);

		const relativeFilePath = path.relative(resolvedLocalPath, resolvedFilePath);
		// 7. 手动刷新js delivr的cdn
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

		// Create and push tag
		await execPromise(`cd "${resolvedLocalPath}" && git tag "${versionTag}"`);
		await execPromise(
			`cd "${resolvedLocalPath}" && git push origin "${versionTag}"`,
		);
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
			// 检查返回的数据是否包含 finished
			const data =
				typeof res.data === "string" ? res.data : JSON.stringify(res.data);
			if (data.includes("finished") || res.data?.status === "finished") {
				this.log.info(`jsDelivr cache purge completed: ${url}`);
			} else {
				throw new Error(
					`jsDelivr cache purge failed: ${url}, response: ${data}`,
				);
			}
		} catch (error: any) {
			throw new Error(
				`jsDelivr cache purge failed: ${url}, error: ${error.message}`,
			);
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
