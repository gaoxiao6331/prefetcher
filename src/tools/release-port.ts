import chalk from "chalk";

const releasePort = (port: string) => {
	console.log(chalk.bgGreen(" RELEASE PORT "));

	const portNum = Number.parseInt(port, 10);
	if (Number.isNaN(portNum) || portNum < 0 || portNum > 65535) {
		console.log(chalk.red("Port must be an integer between 0 and 65535."));
		return;
	}

	const command = `lsof -i :${port} | grep -v PID | awk '{print $2}' | xargs kill -9`;
	console.log(chalk.green(`${command}`));
};

export default releasePort;
