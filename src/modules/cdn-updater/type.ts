export interface UploadResult {
	/**
	 * CDN URL used to access the uploaded file
	 */
	url: string;
}

/**
 * Interface for CDN Provider (e.g., JsDelivr, S3, OSS)
 */
export interface CdnUpdater {
	/**
	 * Upload content to the CDN provider.
	 * @param branchName Target branch name (or bucket/folder concept)
	 * @param fileName Target file name
	 * @param content Content to upload
	 */
	update(
		branchName: string,
		fileName: string,
		content: string,
	): Promise<UploadResult>;

	/**
	 * Verify if the content on the CDN matches the expected content.
	 * This is useful because CDNs often have caching delays.
	 * @param url CDN URL to verify
	 * @param content Expected content
	 */
	verifyContentUpdate(url: string, content: string): Promise<boolean>;
}
