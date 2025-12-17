import { exec } from "child_process";
import type { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execPromise = promisify(exec);

// 使用这个服务前需要配置github ssh
class JsDelivrService {
  private readonly localPath: string;
  private readonly remoteAddr: string;

  private constructor(private fastify: FastifyInstance) {
    const { localPath, remoteAddr } = fastify.config.cdn?.jsDelivr || {};
    if (!localPath || !remoteAddr) {
      throw new Error("Invalid jsDelivr config");
    }
    this.localPath = localPath;
    this.remoteAddr = remoteAddr;
  }

  static async create(fastify: FastifyInstance) {
    const instance = new JsDelivrService(fastify);
    await instance.initGit();
    return instance;
  }

  async initGit() {
    // Set git user info
    await execPromise(`git config user.name "prefetch bot"`);
    await execPromise(`git config user.email "gaoxiao6331@163.com"`);
  }

  parseRepoInfo(remoteAddr: string) {
    // 解析github远程仓库的用户名和项目名 eg：https://github.com/gaoxiao6331/cdn-test
    const match = remoteAddr.match(/https:\/\/github.com\/([^/]+)\/([^/]+)/);
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
      this.fastify.log.info(
        `Local path "${resolvedLocalPath}" does not exist, cloning remote repository`
      );
      await execPromise(`git clone "${remoteAddr}" "${resolvedLocalPath}"`);
    }

    // 检查本地是否存在branchName分支，不存在创建去远程拉取，远程不存在则创建
    try {
      // Check if branch exists locally
      await execPromise(
        `cd "${resolvedLocalPath}" && git rev-parse --verify "${branchName}"`
      );
      // Branch exists, switch to it
      this.fastify.log.info(
        `Branch "${branchName}" exists locally, switching to it`
      );
      await execPromise(
        `cd "${resolvedLocalPath}" && git checkout "${branchName}"`
      );
    } catch (error) {
      // Branch doesn't exist locally, check if it exists remotely
      try {
        await execPromise(
          `cd "${resolvedLocalPath}" && git rev-parse --verify "origin/${branchName}"`
        );
        // Branch exists remotely, check it out
        this.fastify.log.info(
          `Branch "${branchName}" exists remotely, checking it out`
        );
        await execPromise(
          `cd "${resolvedLocalPath}" && git checkout -b "${branchName}" "origin/${branchName}"`
        );
      } catch (remoteError) {
        // Branch doesn't exist remotely either, create it
        // TODO 清空main分支，基于空白分支创建新分支
        this.fastify.log.info(
          `Branch "${branchName}" does not exist, creating it`
        );
        await execPromise(
          `cd "${resolvedLocalPath}" && git checkout -b "${branchName}"`
        );
      }
    }

    const resolvedFilePath = path.join(resolvedLocalPath, fileName);

    // 检查文件是否存在
    if (!fs.existsSync(resolvedFilePath)) {
      fs.writeFileSync(resolvedFilePath, "");
    }

    // 3. 检查当前file对应的git commit tag作为版本号
    let version = 1;
    try {
      // Try to get the latest tag for this file
      const tags = await this.getLatestTags(resolvedLocalPath, fileName);
      if (tags.length > 0) {
        const latestTag = tags[0];
        const match = latestTag.match(new RegExp(`${fileName}-(\\d+)`));
        if (match) {
          version = parseInt(match[1], 10) + 1;
        }
      }
    } catch (error) {
      // If there's an error getting tags, we'll use the default version of 1
      this.fastify.log.warn(
        error,
        "Could not retrieve git tags, using default version"
      );
    }

    // 4. 初始版本号为{projectName}-{filename}-1，如果上一步没有获取到tag就使用初始值，否则最后的数字+1
    const versionTag = `${fileName}-${version}`;

    // Write the content to the file
    fs.writeFileSync(resolvedFilePath, content);

    // 5. 将content的内容写入文件，通过git 提交，内容为"update: {版本号}"
    await this.gitAddCommitAndPush(
      resolvedLocalPath,
      resolvedFilePath,
      versionTag
    );

    const { namespace, projectName } = this.parseRepoInfo(remoteAddr);

    const relativeFilePath = path.relative(resolvedLocalPath, resolvedFilePath);
    // 7. 手动刷新js delivr的cdn
    await this.purgeJsDelivrCache(
      namespace,
      projectName,
      relativeFilePath,
      branchName
    );

    return {
      url: this.getCdnAddr(
        namespace,
        projectName,
        relativeFilePath,
        branchName
      ),
    };
  }

  private async getLatestTags(
    projectPath: string,
    fileName: string
  ): Promise<string[]> {
    try {
      const { stdout } = await execPromise(
        `cd "${projectPath}" && git tag --sort=-creatordate | grep "${fileName}"`
      );
      return stdout
        .trim()
        .split("\n")
        .filter((tag) => tag.length > 0);
    } catch (error) {
      this.fastify.log.warn(error as Error, "Error getting git tags");
      return [];
    }
  }

  private async gitAddCommitAndPush(
    localPath: string,
    filePath: string,
    versionTag: string
  ): Promise<void> {
    // Make sure both paths are resolved to absolute paths
    const resolvedLocalPath = path.resolve(localPath);
    const resolvedFilePath = path.resolve(filePath);

    // Get the path relative to the repository root for git operations
    const relativeFilePath = path.relative(resolvedLocalPath, resolvedFilePath);

    // Add file to git using the relative path
    await execPromise(
      `cd "${resolvedLocalPath}" && git add "${relativeFilePath}"`
    );

    // Check if there are changes to commit
    const { stdout: statusOutput } = await execPromise(
      `cd "${resolvedLocalPath}" && git status --porcelain`
    );
    if (statusOutput.trim() === "") {
      this.fastify.log.info("No changes to commit");
      return;
    }

    // Commit with version tag message
    await execPromise(
      `cd "${resolvedLocalPath}" && git commit -m "update: ${versionTag}"`
    );

    // Push to remote repository
    await execPromise(`cd "${resolvedLocalPath}" && git push origin HEAD`);

    // Create and push tag
    await execPromise(`cd "${resolvedLocalPath}" && git tag "${versionTag}"`);
    await execPromise(
      `cd "${resolvedLocalPath}" && git push origin "${versionTag}"`
    );
  }

  private async purgeJsDelivrCache(
    namespace: string,
    projectName: string,
    relativeFilePath: string,
    branchName: string
  ): Promise<void> {
    // Using jsDelivr purge API
    const url = `https://purge.jsdelivr.net/gh/${namespace}/${projectName}@${branchName}/${relativeFilePath}`;
    this.fastify.log.info(`Purging jsDelivr cache: ${url}`);
    const res = await execPromise(`curl -s "${url}"`);
    // 检查返回的status 是否是finished
    if (res.stdout.includes("finished")) {
      this.fastify.log.info(`jsDelivr cache purge completed: ${url}`);
    } else {
      throw new Error(`jsDelivr cache purge failed: ${url}, ${res.stdout}`);
    }
  }

  private getCdnAddr(
    namespace: string,
    projectName: string,
    relativeFilePath: string,
    branchName: string
  ) {
    const url = `https://cdn.jsdelivr.net/gh/${namespace}/${projectName}@${branchName}/${relativeFilePath}`;
    return url;
  }

  async verifyContentUpdate(url: string, content: string) {
    // Check if content is available via jsDelivr
    this.fastify.log.info(`Verifying content update: ${url}`);
    const { stdout } = await execPromise(`curl -s "${url}"`);

    if (stdout !== content) {
      this.fastify.log.warn(
        {
          url,
          expected: content,
          got: stdout,
        },
        "Content verification failed: content mismatch"
      );
      return false;
    }
    return true;
  }
}

export default JsDelivrService;
