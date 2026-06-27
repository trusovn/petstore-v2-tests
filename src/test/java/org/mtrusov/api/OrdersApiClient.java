package org.mtrusov.api;

import io.restassured.response.Response;
import org.mtrusov.config.AuthProvider;
import org.mtrusov.models.Order;

import static io.restassured.RestAssured.given;

public class OrdersApiClient extends BaseApiClient {
    public OrdersApiClient(ApiConfig apiConfig, AuthProvider authProvider) {
        super(apiConfig, authProvider);
    }

    public Response placeOrder(Order order) {
        return given()
                .spec(requestSpecification)

                .when()
                .body(order)
                .post("/order")
                
                .then()
                .spec(responseSpecification)
                .extract().response();
    }

    public Response delete(int orderId) {
       return delete(String.valueOf(orderId));
    }

    public Response delete(String orderId) {
       return given()
                .spec(requestSpecification)
                .pathParam("orderId", orderId)

                .when()
                .delete("/order/{orderId}")

                .then()
                .spec(responseSpecification)
                .extract().response();
    }

    public Response get(int orderId) {
        return delete(String.valueOf(orderId));
    }

    public Response get(String orderId) {
        return given()
                .spec(requestSpecification)
                .pathParam("orderId", orderId)

                .when()
                .get("/order/{orderId}")

                .then()
                .spec(responseSpecification)
                .extract().response();
    }
}
