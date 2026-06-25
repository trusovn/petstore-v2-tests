package org.mtrusov.api;

import io.restassured.builder.RequestSpecBuilder;
import io.restassured.builder.ResponseSpecBuilder;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import io.restassured.specification.ResponseSpecification;
import org.mtrusov.config.AuthProvider;

public class BaseApiClient {
    protected final RequestSpecification requestSpecification;
    protected final ResponseSpecification responseSpecification;
    protected final AuthProvider authProvider;

    public BaseApiClient(ApiConfig apiConfig, AuthProvider authProvider) {
        requestSpecification = buildRequestSpecification(apiConfig);
        responseSpecification = buildResponseSpecification();
        this.authProvider = authProvider;
    }

    protected ResponseSpecification buildResponseSpecification() {
        return new ResponseSpecBuilder()
                .expectContentType(ContentType.JSON)
                .build();
    }

    protected RequestSpecification buildRequestSpecification(ApiConfig apiConfig) {
        return new RequestSpecBuilder()
                .setBaseUri(apiConfig.baseUri())
                .setBasePath(apiConfig.basePath())
                .setAccept(ContentType.JSON)
                .setContentType(ContentType.JSON)
                .build();
    }
}
