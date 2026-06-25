package org.mtrusov.api;

import io.restassured.response.Response;
import org.mtrusov.config.AuthProvider;
import org.mtrusov.models.Order;

import static io.restassured.RestAssured.given;

public class OrdersApiClient extends BaseApiClient{
    public OrdersApiClient(ApiConfig apiConfig, AuthProvider authProvider) {
        super(apiConfig, authProvider);
    }

    public Response placeOrder(Order order) {
        return
            given()
                .spec(requestSpecification)
                .log().all()
            .when()
                .body(order)
                .post("/order")
            .then()
                .spec(responseSpecification)
                .log().all()
                .extract().response();
    }
}
