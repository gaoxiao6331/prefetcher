import type { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

class JsDelivrService {
    private constructor(private fastify: FastifyInstance) {

    }

    static create(fastify: FastifyInstance) {
        return new JsDelivrService(fastify);
    }

   async update(repoPath: string, projectName: string, fileName: string, content: string) {
        // 1. 检查repoPath是否存在，不存在直接抛异常, 这里的path可能是相对路径，也可能是绝对路径
        if (!fs.existsSync(path.resolve(repoPath))) {
            throw new Error(`Repository path does not exist: ${repoPath}`);
        }

        // 2. 检查repoPath下是否存在projectName和fileName，不存在就创建
        const projectPath = path.join(repoPath, projectName);
        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
        }
        
        const filePath = path.join(projectPath, fileName);
        
        // 3. 检查当前file对应的git commit tag作为版本号
        let version = 1;
        try {
            // Try to get the latest tag for this file
            const tags = await this.getLatestTags(projectPath, fileName);
            if (tags.length > 0) {
                const latestTag = tags[0];
                const match = latestTag.match(new RegExp(`${projectName}-${fileName}-(\\d+)`));
                if (match) {
                    version = parseInt(match[1], 10) + 1;
                }
            }
        } catch (error) {
            // If there's an error getting tags, we'll use the default version of 1
            this.fastify.log.warn(error, 'Could not retrieve git tags, using default version');
        }

        // 4. 初始版本号为{projectName}-{filename}-1，如果上一步没有获取到tag就使用初始值，否则最后的数字+1
        const versionTag = `${projectName}-${fileName}-${version}`;
        
        // Write the content to the file
        fs.writeFileSync(filePath, content);
        
        // 5. 将content的内容写入文件，通过git 提交，内容为"update: {版本号}"
        await this.gitAddCommitAndPush(repoPath, filePath, versionTag);
        
        
        // 7. 手动刷新js delivr的cdn
        await this.purgeJsDelivrCache(projectName, fileName);
        
        // 8. 检查内容是否更新
        await this.verifyContentUpdate(projectName, fileName, content);
    }

    private async getLatestTags(projectPath: string, fileName: string): Promise<string[]> {
        try {
            const { stdout } = await execPromise(`cd "${projectPath}" && git tag --sort=-creatordate | grep "${fileName}"`);
            return stdout.trim().split('\n').filter(tag => tag.length > 0);
        } catch (error) {
            this.fastify.log.warn(error as Error, 'Error getting git tags');
            return [];
        }
    }

    private async gitAddCommitAndPush(repoPath: string, filePath: string, versionTag: string): Promise<void> {
        try {
            // Add file to git
            await execPromise(`cd "${repoPath}" && git add "${filePath}"`);
            
            // Commit with version tag message
            await execPromise(`cd "${repoPath}" && git commit -m "update: ${versionTag}"`);
            
            // Push to remote repository
            await execPromise(`cd "${repoPath}" && git push origin HEAD`);
            
            // Create and push tag
            await execPromise(`cd "${repoPath}" && git tag "${versionTag}"`);
            await execPromise(`cd "${repoPath}" && git push origin "${versionTag}"`);
        } catch (error) {
            const err = error as Error;
            this.fastify.log.error(err, 'Error during git operations');
            throw new Error(`Git operations failed: ${err.message}`);
        }
    }

    private async purgeJsDelivrCache(projectName: string, fileName: string): Promise<void> {
        try {
            // Using jsDelivr purge API
            const url = `https://purge.jsdelivr.net/gh/${projectName}/${fileName}`;
            await execPromise(`curl -X POST "${url}"`);
        } catch (error) {
            this.fastify.log.warn(error as Error, 'Failed to purge jsDelivr cache');
            // Don't throw error as this shouldn't stop the update process
            // TODO alert administrator or take other appropriate action
        }
    }

    private async verifyContentUpdate(projectName: string, fileName: string, content: string): Promise<void> {
        try {
            // Give some time for the CDN to update
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Check if content is available via jsDelivr
            const url = `https://cdn.jsdelivr.net/gh/${projectName}/${fileName}`;
            const { stdout } = await execPromise(`curl -s "${url}"`);
            
            if (stdout !== content) {
                this.fastify.log.warn('Content verification failed: content mismatch');
            }
        } catch (error) {
            this.fastify.log.warn(error as Error, 'Content verification failed');
            // TODO alert administrator or take other appropriate action
        }
    }
}

export default JsDelivrService;