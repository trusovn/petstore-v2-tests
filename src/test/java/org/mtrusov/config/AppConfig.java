package org.mtrusov.config;

import org.mtrusov.api.ApiConfig;

public record AppConfig(
        String baseUri,
        BasePaths basePaths
) {
    public ApiConfig storeApiConfig() {
        return new ApiConfig(
                baseUri,
                basePaths.store()
        );
    }
}
