export interface NotifierService {
	info: (message: string, targets: string[]) => Promise<void>;
	warn: (message: string, targets: string[]) => Promise<void>;
	error: (message: string, targets: string[]) => Promise<void>;
}
