package org.mtrusov.tests;

import io.restassured.response.Response;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mtrusov.api.InventoryApiClient;
import org.mtrusov.config.*;
import org.mtrusov.utils.SchemaValidator;

import java.util.stream.Stream;

import static org.mtrusov.utils.AssertUtils.*;

public class StoreInventoryContractTests extends TestsBase {

    @Test
    public void getInventoryAuth() {
        Response response = inventoryApiClientAuth.get();
        assertResponseCode(response, 200);
        SchemaValidator.validateJsonSchema("schemas/GetInventoryResponseSchema.json", response);
    }

    @ParameterizedTest
    @MethodSource("invalidProviders")
    @Quarantine
    public void getInventoryNoAuthFails(AuthProvider authProvider) {
        InventoryApiClient apiClient = new InventoryApiClient(apiConfig, authProvider);
        Response response = apiClient.get();
        assertResponseCode(response, 401);
        SchemaValidator.validateJsonSchema("schemas/ErrorResponseSchema.json", response);
    }

    private static Stream<Arguments> invalidProviders() {
        return Stream.of(
                Arguments.of(Named.of("No api_key header is set", new NoAuthProvider())),
                Arguments.of(Named.of("Invalid api_key header is provided", new TokenAuthProvider("INVALID_TOKEN"))),
                Arguments.of(Named.of("Empty api_key header is provided", new TokenAuthProvider("")))
        );
    }
}
