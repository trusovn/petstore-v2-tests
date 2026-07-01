package org.mtrusov.tests;

import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mtrusov.api.InventoryApiClient;
import org.mtrusov.config.ConfigLoader;
import org.mtrusov.config.NoAuthProvider;
import org.mtrusov.config.ValidTokenAuthProvider;
import org.mtrusov.utils.SchemaValidator;

import static org.mtrusov.utils.AssertUtils.*;

public class StoreInventoryContractTests {
    private static InventoryApiClient inventoryApiClientNoAuth;
    private static InventoryApiClient inventoryApiClientAuth;

    @BeforeAll
    static void beforeAll() {
        var config = ConfigLoader.load().storeApiConfig();
        inventoryApiClientNoAuth = new InventoryApiClient(config, new NoAuthProvider());
        inventoryApiClientAuth = new InventoryApiClient(config, new ValidTokenAuthProvider());

        RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();
    }

    @Test
    public void getInventoryAuth() {
        Response response = inventoryApiClientAuth.get();
        assertResponseCode(response, 200);
        SchemaValidator.validateJsonSchema("schemas/InventorySchema.json", response);
    }

    @Test
    public void getInventoryNoAuthFails() {
        Response response = inventoryApiClientNoAuth.get();
        assertResponseCode(response, 401);
        SchemaValidator.validateJsonSchema("schemas/InfoMessageSchema.json", response);
    }
}
