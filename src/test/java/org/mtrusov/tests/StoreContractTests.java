package org.mtrusov.tests;

import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mtrusov.api.InventoryApiClient;
import org.mtrusov.api.OrdersApiClient;
import org.mtrusov.config.ConfigLoader;
import org.mtrusov.config.NoAuthProvider;
import org.mtrusov.factories.Orders;
import org.mtrusov.utils.SchemaValidator;

public class StoreContractTests {
    private static InventoryApiClient inventoryApiClient;
    private static OrdersApiClient ordersApiClient;

    @BeforeAll
    static void beforeAll() {
        var config = ConfigLoader.load().storeApiConfig();
        inventoryApiClient = new InventoryApiClient(config, new NoAuthProvider());
        ordersApiClient = new OrdersApiClient(config, new NoAuthProvider());

        RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();
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

    @Test
    public void deleteOrderInvalidId() {
        Response response = ordersApiClient.delete("asdf");
        SchemaValidator.validateJsonSchema("schemas/ErrorMessageSchema.json", response);
    }

    @Test
    public void deleteOrderMissingId() {
        Response response = ordersApiClient.delete(1010101010);
        SchemaValidator.validateJsonSchema("schemas/ErrorMessageSchema.json", response);
    }

     @Test
     public void getOrderValidId() {
         Response response = ordersApiClient.get(1);
         SchemaValidator.validateJsonSchema("schemas/OrderSchema.json", response);
     }

    @Test
    public void getOrderInvalidId() {
        Response response = ordersApiClient.get("INVALID");
        SchemaValidator.validateJsonSchema("schemas/ErrorMessageSchema.json", response);
    }

    @Test
    public void getOrderMissingId() {
        Response response = ordersApiClient.get(1010101010);
        SchemaValidator.validateJsonSchema("schemas/ErrorMessageSchema.json", response);
    }
}
