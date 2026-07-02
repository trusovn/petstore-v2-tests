package org.mtrusov.api;

import io.restassured.builder.RequestSpecBuilder;
import io.restassured.builder.ResponseSpecBuilder;
import io.restassured.config.LogConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import io.restassured.specification.ResponseSpecification;
import io.qameta.allure.restassured.AllureRestAssured;
import org.mtrusov.config.AuthProvider;
import org.mtrusov.utils.ApiKeyObfuscatingPrintStream;

import java.util.Objects;

public class BaseApiClient {
    protected final RequestSpecification requestSpecification;
    protected final ResponseSpecification responseSpecification;
    protected final AuthProvider authProvider;

    public BaseApiClient(ApiConfig apiConfig, AuthProvider authProvider) {
        this.authProvider = authProvider;
        requestSpecification = buildRequestSpecification(apiConfig);
        responseSpecification = buildResponseSpecification();
    }

    protected ResponseSpecification buildResponseSpecification() {
        return new ResponseSpecBuilder()
                .expectContentType(ContentType.JSON)
                .build();
    }

    protected RequestSpecification buildRequestSpecification(ApiConfig apiConfig) {
        LogConfig logConfig = LogConfig.logConfig()
                .defaultStream(new ApiKeyObfuscatingPrintStream(System.out))
                .enableLoggingOfRequestAndResponseIfValidationFails();
        RequestSpecBuilder request = new RequestSpecBuilder()
                .setBaseUri(apiConfig.baseUri())
                .setBasePath(apiConfig.basePath())
                .setAccept(ContentType.JSON)
                .setContentType(ContentType.JSON)
                .setConfig(RestAssuredConfig.config().logConfig(logConfig))
                .addFilter(new AllureRestAssured()
                        .setRequestTemplate("api-key-http-request.ftl"));
        if (authProvider != null && Objects.nonNull(authProvider.token())) {
            request = request.addHeader("api_key", authProvider.token());
        }
        return request.build();
    }
}
