package org.mtrusov.api;

import io.qameta.allure.restassured.AllureRestAssured;
import io.restassured.builder.RequestSpecBuilder;
import io.restassured.builder.ResponseSpecBuilder;
import io.restassured.config.LogConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import io.restassured.specification.ResponseSpecification;
import org.mtrusov.config.AuthProvider;

import java.util.Objects;

public final class Specifications {
    public static ResponseSpecification getResponseSpecification(ContentType contentType) {
        return new ResponseSpecBuilder()
                .expectContentType(contentType)
                .build();
    }

    public static RequestSpecification getRequestSpecification(
            ApiConfig apiConfig,
            ContentType acceptContentType,
            ContentType contentType,
            AuthProvider authProvider
    ) {
        LogConfig logConfig = LogConfig.logConfig()
                .blacklistDefaultSensitiveHeaders()
                .blacklistHeader("api_key")
                .enableLoggingOfRequestAndResponseIfValidationFails();
        RequestSpecBuilder request = new RequestSpecBuilder()
                .setBaseUri(apiConfig.baseUri())
                .setBasePath(apiConfig.basePath())
                .setAccept(acceptContentType)
                .setContentType(contentType)
                .setConfig(RestAssuredConfig.config().logConfig(logConfig))
                .addFilter(new AllureRestAssured()
                        .setRequestTemplate("api-key-http-request.ftl"));
        if (authProvider != null && Objects.nonNull(authProvider.token())) {
            request = request.addHeader("api_key", authProvider.token());
        }
        return request.build();
    }
}
