package org.mtrusov.api;

import io.restassured.builder.RequestSpecBuilder;
import io.restassured.builder.ResponseSpecBuilder;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import io.restassured.specification.ResponseSpecification;
import org.mtrusov.config.AuthProvider;

import java.util.Objects;

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
        RequestSpecBuilder request = new RequestSpecBuilder()
                .setBaseUri(apiConfig.baseUri())
                .setBasePath(apiConfig.basePath())
                .setAccept(ContentType.JSON)
                .setContentType(ContentType.JSON);
        if (authProvider != null && Objects.nonNull(authProvider.token())) {
            request = request.addHeader("api_key", authProvider.token());
        }
        return request.build();
    }
}
