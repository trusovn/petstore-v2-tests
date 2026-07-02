package org.mtrusov.api;

import io.qameta.allure.attachment.FreemarkerAttachmentRenderer;
import io.qameta.allure.attachment.http.HttpRequestAttachment;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AllureRequestTemplateTests {
    private static final String TEMPLATE = "api-key-http-request.ftl";

    @Test
    void hidesApiKeyWithoutChangingOtherHeaders() {
        String apiKey = "secret-token-123";

        String attachment = render(Map.of(
                "API_KEY", apiKey,
                "Accept", "application/json"
        ));

        assertThat(attachment)
                .contains("API_KEY: [ HIDDEN ]")
                .contains("Accept: application/json")
                .doesNotContain(apiKey);
    }

    private String render(Map<String, String> headers) {
        HttpRequestAttachment request = HttpRequestAttachment.Builder
                .create("Request", "http://localhost:8080/v2/store/inventory")
                .setMethod("GET")
                .setHeaders(headers)
                .build();

        return new FreemarkerAttachmentRenderer(TEMPLATE)
                .render(request)
                .getContent();
    }
}
