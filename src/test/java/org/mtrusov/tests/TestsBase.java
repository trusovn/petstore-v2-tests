package org.mtrusov.tests;

import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeAll;
import org.mtrusov.api.ApiConfig;
import org.mtrusov.api.InventoryApiClient;
import org.mtrusov.api.OrdersApiClient;
import org.mtrusov.api.Specifications;
import org.mtrusov.config.ConfigLoader;
import org.mtrusov.config.NoAuthProvider;
import org.mtrusov.config.TokenAuthProvider;

public class TestsBase {
    protected static InventoryApiClient inventoryApiClientAuth;
    protected static OrdersApiClient ordersApiClient;
    protected static ApiConfig apiConfig;

    @BeforeAll
    static void beforeAll() {
        var appConfig = ConfigLoader.load();
        apiConfig = appConfig.storeApiConfig();
        inventoryApiClientAuth = new InventoryApiClient(
                apiConfig,
                new TokenAuthProvider(appConfig.resolvedPetstoreApiKey())
        );
        ordersApiClient = new OrdersApiClient(apiConfig, new NoAuthProvider());

        RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();
    }
}
