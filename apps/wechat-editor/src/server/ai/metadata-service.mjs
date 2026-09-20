export function createMetadataService({ textProvider, imageProvider, coverProcessor } = {}) {
  if (!textProvider) throw new Error("metadata service 需要 textProvider");
  return {
    async generate({ markdown, title = "", tone, includeCover = false } = {}) {
      const metadata = await textProvider.generateMetadata({ markdown, currentTitle: title, tone });
      if (!includeCover) return metadata;
      if (!imageProvider || !coverProcessor) throw Object.assign(new Error("封面生成服务尚未配置。"), { code: "AI_IMAGE_NOT_CONFIGURED", status: 503 });
      const generated = await imageProvider.generateCover({ prompt: metadata.coverPrompt });
      const processed = await coverProcessor.processUrl(generated.url);
      return { ...metadata, cover: processed };
    },
  };
}
