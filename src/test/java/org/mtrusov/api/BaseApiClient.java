package org.mtrusov.api;

import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import io.restassured.specification.ResponseSpecification;
import org.mtrusov.config.AuthProvider;

import static org.mtrusov.api.Specifications.getRequestSpecification;
import static org.mtrusov.api.Specifications.getResponseSpecification;

public class BaseApiClient {
    protected final RequestSpecification requestSpecification;
    protected final ResponseSpecification responseSpecification;

    public BaseApiClient(ApiConfig apiConfig, AuthProvider authProvider) {
        requestSpecification = getRequestSpecification(apiConfig, ContentType.JSON, ContentType.JSON,  authProvider);
        responseSpecification = getResponseSpecification(ContentType.JSON);
    }

    public BaseApiClient(RequestSpecification requestSpecification, ResponseSpecification responseSpecification) {
        this.requestSpecification = requestSpecification;
        this.responseSpecification = responseSpecification;
    }
}
