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
        return load("application.config.yaml");
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
}
