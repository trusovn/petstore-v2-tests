package org.mtrusov.api;

import io.restassured.response.Response;
import org.mtrusov.config.AuthProvider;

import static io.restassured.RestAssured.*;

public class InventoryApiClient extends BaseApiClient {
    public InventoryApiClient(ApiConfig apiConfig, AuthProvider authProvider) {
        super(apiConfig, authProvider);
    }

    public Response get() {
        return given()
                .spec(requestSpecification)
                .log().all()
                .when()
                .get("/inventory")
                .then()
                .spec(responseSpecification)
                .log().all()
                .extract().response();
    }
}
