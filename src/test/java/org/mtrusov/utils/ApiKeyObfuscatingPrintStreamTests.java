package org.mtrusov.utils;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class ApiKeyObfuscatingPrintStreamTests {

    @Test
    void obfuscatesApiKeysWithoutChangingOtherLogContent() {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        PrintStream stream = new ApiKeyObfuscatingPrintStream(
                new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        stream.println("""
                Headers:        Accept=application/json
                                API_KEY=secret-token-123
                                Content-Type=application/json
                """);

        assertThat(output.toString(StandardCharsets.UTF_8))
                .contains("API_KEY=secr...")
                .contains("Accept=application/json")
                .contains("Content-Type=application/json")
                .doesNotContain("secret-token-123");
    }

    @Test
    void obfuscatesBufferedValidationFailureLogs() {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        PrintStream stream = new ApiKeyObfuscatingPrintStream(
                new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        stream.print("api_key=INVALID_TOKEN");

        assertThat(output.toString(StandardCharsets.UTF_8))
                .isEqualTo("api_key=INVA...");
    }

    @Test
    void fullyObfuscatesApiKeysShorterThanTheVisiblePrefix() {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        PrintStream stream = new ApiKeyObfuscatingPrintStream(
                new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        stream.println("api_key=abc");

        assertThat(output.toString(StandardCharsets.UTF_8))
                .contains("api_key=...")
                .doesNotContain("abc");
    }

    @Test
    void obfuscatesAnEmptyApiKeyWithoutChangingTheNextHeader() {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        PrintStream stream = new ApiKeyObfuscatingPrintStream(
                new PrintStream(output, true, StandardCharsets.UTF_8)
        );

        stream.println("""
                api_key=
                Content-Type=application/json
                """);

        assertThat(output.toString(StandardCharsets.UTF_8))
                .contains("api_key=...")
                .contains("Content-Type=application/json");
    }
}
