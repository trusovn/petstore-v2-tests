package org.mtrusov.tests;

import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mtrusov.api.InventoryApiClient;
import org.mtrusov.api.OrdersApiClient;
import org.mtrusov.config.ConfigLoader;
import org.mtrusov.config.NoAuthProvider;
import org.mtrusov.factories.Orders;
import org.mtrusov.models.Order;
import org.mtrusov.utils.SchemaValidator;

public class StoreContractTests {
    private static InventoryApiClient inventoryApiClient;
    private static OrdersApiClient ordersApiClient;

    @BeforeAll
    static void beforeAll() {
        var config = ConfigLoader.load().storeApiConfig();
        inventoryApiClient = new InventoryApiClient(config, new NoAuthProvider());
        ordersApiClient = new OrdersApiClient(config, new NoAuthProvider());
    }

    @Test
    public void getInventory() {
        Response response = inventoryApiClient.get();
        SchemaValidator.validateJsonSchema("schemas/InventorySchema.json", response);
    }


    @Test
    public void createOrder() {
        Response response = ordersApiClient.placeOrder(Orders.defaultOrder());
        SchemaValidator.validateJsonSchema("schemas/OrderSchema.json", response);
    }

//    @Test
//    public void deleteOrderInvalidId() {
//        Response response = given()
//                .spec(requestSpecification)
//                .log().all()
//                .when()
//                .delete("/order/asdf")
//                .then()
//                .log().all()
//                .extract().response();
//        SchemaValidator.validateJsonSchema("schemas/ErrorMessageSchema.json", response);
//    }
//
//    @Test
//    public void deleteOrderMissingId() {
//        Response response = given()
//                .spec(requestSpecification)
//                .log().all()
//                .when()
//                .delete("/order/1")
//                .then()
//                .log().all()
//                .extract().response();
//        SchemaValidator.validateJsonSchema("schemas/ErrorMessageSchema.json", response);
//    }
//
//    @Test
//    public void getOrderValidId() {
//        Response response = given()
//                .spec(requestSpecification)
//                .log().all()
//                .when()
//                .get("/order/4")
//                .then()
//                .log().all()
//                .extract().response();
//        SchemaValidator.validateJsonSchema("schemas/OrderSchema.json", response);
//    }
//
//    @Test
//    public void getOrderInvalidId() {
//        Response response = given()
//                .spec(requestSpecification)
//                .log().all()
//                .when()
//                .get("/order/1")
//                .then()
//                .log().all()
//                .extract().response();
//        SchemaValidator.validateJsonSchema("schemas/ErrorMessageSchema.json", response);
//    }
}
