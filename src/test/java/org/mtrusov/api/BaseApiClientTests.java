package org.mtrusov.api;

import io.restassured.config.LogConfig;
import io.restassured.filter.log.LogDetail;
import io.restassured.internal.print.RequestPrinter;
import io.restassured.specification.FilterableRequestSpecification;
import io.restassured.specification.SpecificationQuerier;
import org.junit.jupiter.api.Test;
import org.mtrusov.config.TokenAuthProvider;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class BaseApiClientTests {

    @Test
    void blacklistsSensitiveHeadersInRestAssuredLogs() {
        BaseApiClient client = new BaseApiClient(
                new ApiConfig("http://localhost:8080", "/v2"),
                new TokenAuthProvider("secret-token-123")
        );

        LogConfig logConfig = SpecificationQuerier.query(client.requestSpecification)
                .getConfig()
                .getLogConfig();

        assertThat(logConfig.blacklistedHeaders())
                .contains("api_key", "Authorization", "Cookie", "Proxy-Authorization");
    }

    @Test
    void fullyBlacklistsApiKeyInNativeRequestLogs() {
        String apiKey = "secret-token-123";
        BaseApiClient client = new BaseApiClient(
                new ApiConfig("http://localhost:8080", "/v2"),
                new TokenAuthProvider(apiKey)
        );
        LogConfig logConfig = SpecificationQuerier.query(client.requestSpecification)
                .getConfig()
                .getLogConfig();
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        String loggedRequest = RequestPrinter.print(
                (FilterableRequestSpecification) client.requestSpecification,
                "GET",
                "http://localhost:8080/v2/store/inventory",
                LogDetail.HEADERS,
                logConfig.blacklistedHeaders(),
                new PrintStream(output, true, StandardCharsets.UTF_8),
                true
        );

        assertThat(loggedRequest)
                .contains("api_key=[ BLACKLISTED ]")
                .doesNotContain(apiKey);
        assertThat(output.toString(StandardCharsets.UTF_8))
                .doesNotContain(apiKey);
    }
}
