package org.mtrusov.api;

import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.mtrusov.config.AuthProvider;
import org.mtrusov.models.Order;

import java.util.Objects;

import static io.restassured.RestAssured.given;

public class OrdersApiClient extends BaseApiClient {
    public OrdersApiClient(ApiConfig apiConfig, AuthProvider authProvider) {
        super(apiConfig, authProvider);
    }

    public Response placeOrder(Object order) {
        RequestSpecification request = given()
                .spec(requestSpecification)
                .when();
        if (Objects.nonNull(order)) {
            request = request.body(order);
        }
        return request
                .post("/order")
                
                .then()
                .log().all()
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
                .log().all()
                .spec(responseSpecification)
                .extract().response();
    }

    public Response get(int orderId) {
        return get(String.valueOf(orderId));
    }

    public Response get(String orderId) {
        return given()
                .spec(requestSpecification)
                .pathParam("orderId", orderId)

                .when()
                .get("/order/{orderId}")

                .then()
                .log().all()
                .spec(responseSpecification)
                .extract().response();
    }
}
