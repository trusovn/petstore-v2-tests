package org.mtrusov.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ConfigLoaderTest {
    private static final String BASE_URI_PROPERTY = "petstore.baseUri";
    private static final String YAML_BASE_URI = "http://localhost:8080/v2";
    private String originalBaseUriProperty;

    @BeforeEach
    void rememberSystemProperty() {
        originalBaseUriProperty = System.getProperty(BASE_URI_PROPERTY);
    }

    @AfterEach
    void restoreSystemProperty() {
        if (originalBaseUriProperty == null) {
            System.clearProperty(BASE_URI_PROPERTY);
        } else {
            System.setProperty(BASE_URI_PROPERTY, originalBaseUriProperty);
        }
    }

    @Test
    void usesYamlBaseUriWhenLoadingAnExplicitResource() {
        assertThat(ConfigLoader.load("application.config.yaml").baseUri())
                .isEqualTo(YAML_BASE_URI);
    }

    @Test
    void systemPropertyOverridesOtherConfiguration() {
        System.setProperty(BASE_URI_PROPERTY, "http://localhost:18080/v2");

        assertThat(ConfigLoader.load().baseUri())
                .isEqualTo("http://localhost:18080/v2");
    }

    @Test
    void blankSystemPropertyFallsBackToEnvironmentOrYaml() {
        System.setProperty(BASE_URI_PROPERTY, " \t ");
        String environmentBaseUri = System.getenv("PETSTORE_BASE_URI");
        String expectedBaseUri = environmentBaseUri == null || environmentBaseUri.isBlank()
                ? YAML_BASE_URI
                : environmentBaseUri;

        assertThat(ConfigLoader.load().baseUri())
                .isEqualTo(expectedBaseUri);
    }
}
