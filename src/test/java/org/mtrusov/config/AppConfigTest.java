package org.mtrusov.config;

import org.junit.jupiter.api.Test;
import org.mtrusov.api.ApiConfig;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AppConfigTest {

    @Test
    void storeApiConfigDoesNotRequireApiKey() {
        AppConfig appConfig = new AppConfig(
                "http://localhost:8080/v2",
                null,
                new BasePaths("store")
        );

        assertThat(appConfig.storeApiConfig())
                .isEqualTo(new ApiConfig("http://localhost:8080/v2", "store"));
    }

    @Test
    void resolvedPetstoreApiKeyFailsWhenNotConfigured() {
        AppConfig appConfig = new AppConfig(
                "http://localhost:8080/v2",
                null,
                new BasePaths("store")
        );

        assertThatThrownBy(appConfig::resolvedPetstoreApiKey)
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("petstoreApiKey is not configured");
    }
}
