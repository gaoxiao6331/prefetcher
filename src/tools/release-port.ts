import { execSync } from "node:child_process";
import chalk from "chalk";

const releasePort = (port: string) => {
	console.log(chalk.bgGreen(" RELEASE PORT "));

	const portNum = Number.parseInt(port, 10);
	if (Number.isNaN(portNum) || portNum < 0 || portNum > 65535) {
		console.log(chalk.red("Port must be an integer between 0 and 65535."));
		return;
	}

	try {
		// 使用 lsof -ti 直接获取 PID，如果没有进程会抛出异常
		const pids = execSync(`lsof -ti :${portNum}`).toString().trim();
		if (pids) {
			console.log(chalk.yellow(`Found processes on port ${portNum}: ${pids.replace(/\n/g, ", ")}`));
			execSync(`kill -9 ${pids.split("\n").join(" ")}`);
			console.log(chalk.green(`Successfully killed processes on port ${portNum}.`));
		} else {
			console.log(chalk.blue(`No process found on port ${portNum}.`));
		}
	} catch (error) {
		// lsof 在找不到进程时会返回非 0 状态码
		console.log(chalk.blue(`No process found on port ${portNum} or already released.`));
	}
};

export default releasePort;
