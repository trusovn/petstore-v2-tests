package org.mtrusov.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLMapper;

import java.io.IOException;
import java.io.InputStream;

public class ConfigLoader {
    private static final ObjectMapper YAML_MAPPER = new YAMLMapper();

    private ConfigLoader() {
    }

    public static AppConfig load() {
        AppConfig config = load("application.config.yaml");
        return new AppConfig(
                effectiveBaseUri(config.baseUri()),
                config.basePaths()
        );
    }

    public static AppConfig load(String resourceName) {
        try (InputStream inputStream = ConfigLoader.class
                .getClassLoader()
                .getResourceAsStream(resourceName)) {
            if (inputStream == null) {
                throw new IllegalArgumentException("Config file not found: " + resourceName);
            }

            return YAML_MAPPER.readValue(inputStream, AppConfig.class);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load config: " + resourceName, e);
        }
    }

    private static String effectiveBaseUri(String yamlBaseUri) {
        String systemProperty = nonBlank(System.getProperty("petstore.baseUri"));
        if (systemProperty != null) {
            return systemProperty;
        }

        String environmentVariable = nonBlank(System.getenv("PETSTORE_BASE_URI"));
        if (environmentVariable != null) {
            return environmentVariable;
        }

        return yamlBaseUri;
    }

    private static String nonBlank(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }
}
