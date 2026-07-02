package org.mtrusov.config;

import org.mtrusov.api.ApiConfig;

public record AppConfig(
        String baseUri,
        String petstoreApiKey,
        BasePaths basePaths
) {
    public ApiConfig storeApiConfig() {
        return new ApiConfig(
                baseUri,
                basePaths.store()
        );
    }

    public String resolvedPetstoreApiKey() {
        if (petstoreApiKey == null || petstoreApiKey.isBlank()) {
            throw new IllegalStateException("petstoreApiKey is not configured");
        }
        return ConfigLoader.resolveEnvPlaceholders(petstoreApiKey);
    }
}
