package org.mtrusov.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLMapper;
import io.github.cdimascio.dotenv.Dotenv;

import java.io.IOException;
import java.io.InputStream;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ConfigLoader {
    private static final ObjectMapper YAML_MAPPER = new YAMLMapper();
    private static final Pattern ENV_PLACEHOLDER = Pattern.compile("\\$\\{(\\w+)}");
    private static final Dotenv DOTENV = Dotenv.configure()
            .ignoreIfMissing()
            .load();

    private ConfigLoader() {
    }

    public static AppConfig load() {
        AppConfig config = load("application.config.yaml");
        return new AppConfig(
                effectiveBaseUri(config.baseUri()),
                config.petstoreApiKey(),
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

    /**
     * Resolves {@code ${ENV_NAME}} placeholders in {@code raw} against environment
     * variables and a repo-root {@code .env} file (real environment takes
     * precedence over {@code .env}). A value without placeholders is returned
     * as-is. Throws if a referenced variable is unset or blank.
     */
    public static String resolveEnvPlaceholders(String raw) {
        Matcher matcher = ENV_PLACEHOLDER.matcher(raw);
        StringBuffer resolved = new StringBuffer();
        while (matcher.find()) {
            String envValue = nonBlank(DOTENV.get(matcher.group(1)));
            if (envValue == null) {
                throw new IllegalStateException("Environment variable not set: " + matcher.group(1));
            }
            matcher.appendReplacement(resolved, Matcher.quoteReplacement(envValue));
        }
        matcher.appendTail(resolved);
        return resolved.toString();
    }

    private static String nonBlank(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }
}
