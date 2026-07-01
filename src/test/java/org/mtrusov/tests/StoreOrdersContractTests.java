package org.mtrusov.tests;

import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mtrusov.api.OrdersApiClient;
import org.mtrusov.config.ConfigLoader;
import org.mtrusov.config.NoAuthProvider;
import org.mtrusov.factories.Orders;
import org.mtrusov.models.Order;
import org.mtrusov.utils.SchemaValidator;

import java.util.stream.Stream;

import static org.mtrusov.utils.AssertUtils.assertInfoMessageFieldCode;
import static org.mtrusov.utils.AssertUtils.assertInfoMessageFieldMessageContains;
import static org.mtrusov.utils.AssertUtils.assertInfoMessageFieldMessageNoTraces;
import static org.mtrusov.utils.AssertUtils.assertResponseCode;
import static org.mtrusov.utils.DateTimeAsserts.assertDateTimeIsValid;

public class StoreOrdersContractTests {
    private static final int PLACED_ORDER_ID = 1001;
    private static final int MISSING_ORDER_ID = 1010101010;

    private static OrdersApiClient ordersApiClient;

    @BeforeAll
    static void beforeAll() {
        var config = ConfigLoader.load().storeApiConfig();
        ordersApiClient = new OrdersApiClient(config, new NoAuthProvider());

        RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();
    }

    @Nested
    class CreateOrder {
        @Test
        public void validBody() {
            Response response = ordersApiClient.placeOrder(Orders.defaultOrder());
            assertResponseCode(response, 200);
            SchemaValidator.validateJsonSchema("schemas/GetCreateOrderSchema.json", response);
            assertOrderShipDateIsValid(response);
        }

        @Test
        public void missingBody() {
            Response response = ordersApiClient.placeOrder(null);
            assertResponseCode(response, 400);
            assertInfoMessageFieldCode(response, 400);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/ErrorResponseSchema.json", response);
        }

        @Test
        public void emptyBody() {
            Response response = ordersApiClient.placeOrder("{}");
            assertResponseCode(response, 400);
            assertInfoMessageFieldCode(response, 400);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/ErrorResponseSchema.json", response);
        }
    }

    @Nested
    class DeleteOrder {
        @Test
        public void deleteOrderValidId() {
            Order order = Orders.defaultOrder();
            Response createdOrderResponse = ordersApiClient.placeOrder(order);
            assertResponseCode(createdOrderResponse, 200);

            Response response = ordersApiClient.delete(order.id());
            assertResponseCode(response, 200);
            assertInfoMessageFieldCode(response, 200);
            SchemaValidator.validateJsonSchema("schemas/DeleteOrderResponseSchema.json", response);
            assertInfoMessageFieldMessageContains(response, order.id().toString());
        }

        @ParameterizedTest
        @MethodSource("org.mtrusov.tests.StoreOrdersContractTests#invalidOrderIds")
        public void deleteOrderInvalidIds(String orderId, int expectedErrorCode) {
            Response response = ordersApiClient.delete(orderId);
            assertResponseCode(response, expectedErrorCode);
            assertInfoMessageFieldCode(response, expectedErrorCode);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/ErrorResponseSchema.json", response);
        }
    }

    @Nested
    class GetOrder {
        @Test
        public void getOrderValidId() {
            Response response = ordersApiClient.get(PLACED_ORDER_ID);
            assertResponseCode(response, 200);
            SchemaValidator.validateJsonSchema("schemas/GetCreateOrderSchema.json", response);
            assertOrderShipDateIsValid(response);
        }

        @ParameterizedTest
        @MethodSource("org.mtrusov.tests.StoreOrdersContractTests#invalidOrderIds")
        public void getOrderInvalidIds(String orderId, int expectedErrorCode) {
            Response response = ordersApiClient.get(orderId);
            assertResponseCode(response, expectedErrorCode);
            assertInfoMessageFieldCode(response, expectedErrorCode);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/ErrorResponseSchema.json", response);
        }
    }

    private static void assertOrderShipDateIsValid(Response response) {
        assertDateTimeIsValid(response, "shipDate");
    }

    public static Stream<Arguments> invalidOrderIds() {
        return Stream.of(
                Arguments.argumentSet(
                        "Non-existing Order ID", String.valueOf(MISSING_ORDER_ID), 404
                ),
                Arguments.argumentSet(
                        "Negative Order ID", "-1", 400
                ),
                Arguments.argumentSet(
                        "Invalid String Order ID", "INVALID", 400
                )
        );
    }
}
