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

import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.params.provider.Arguments.argumentSet;
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
        var apiConfig = ConfigLoader.load().storeApiConfig();
        ordersApiClient = new OrdersApiClient(apiConfig, new NoAuthProvider());

        RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();
    }

    @Nested
    class CreateOrder {
        @Test
        @Quarantine
        public void validBody() {
            Order order = Orders.defaultOrder();
            Response response = ordersApiClient.placeOrder(order);
            assertResponseCode(response, 200);
            SchemaValidator.validateJsonSchema("schemas/OrderResponseSchema.json", response);
            assertOrderShipDateIsValid(response);
            response.then()
                    .body("id", equalTo(order.id()))
                    .body("petId", equalTo(order.petId()))
                    .body("quantity", equalTo(order.quantity()))
                    .body("status", equalTo(order.status().value()))
                    .body("complete", equalTo(order.complete()));
        }

        @ParameterizedTest
        @MethodSource("regularInvalidOrders")
        public void invalidBody(Object requestBody, int expectedStatusCode) {
            assertInvalidBody(requestBody, expectedStatusCode);
        }

        @ParameterizedTest
        @MethodSource("quarantinedInvalidOrders")
        @Quarantine
        public void quarantinedInvalidBody(Object requestBody, int expectedStatusCode) {
            assertInvalidBody(requestBody, expectedStatusCode);
        }

        private void assertInvalidBody(Object requestBody, int expectedStatusCode) {
            Response response = ordersApiClient.placeOrder(requestBody);
            assertResponseCode(response, expectedStatusCode);
            assertInfoMessageFieldCode(response, expectedStatusCode);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/ErrorResponseSchema.json", response);
        }

        private static Stream<Arguments> regularInvalidOrders() {
            return Stream.of(
                    argumentSet(
                            "Malformed request body",
                            "{\"malformed\":}", 400
                    )
            );
        }

        private static Stream<Arguments> quarantinedInvalidOrders() {
            return Stream.of(
                    argumentSet(
                            "Missing request body",
                            null, 400
                    ),
                    argumentSet(
                            "Empty request body",
                            "{}", 400
                    ),
                    argumentSet(
                            "Invalid order ID",
                            Orders.defaultOrderWithModifiedField("id", "asdf"), 400
                    ),
                    argumentSet(
                            "Invalid order petId",
                            Orders.defaultOrderWithModifiedField("petId", "asdf"), 400
                    ),
                    argumentSet(
                            "Invalid order quantity",
                            Orders.defaultOrderWithModifiedField("quantity", "asdf"), 400
                    ),
                    argumentSet(
                            "Invalid order shipDate",
                            Orders.defaultOrderWithModifiedField("shipDate", "asdf"), 400
                    ),
                    argumentSet(
                            "Invalid order status",
                            Orders.defaultOrderWithModifiedField("status", "asdf"), 400
                    ),
                    argumentSet(
                            "Invalid order complete",
                            Orders.defaultOrderWithModifiedField("complete", "asdf"), 400
                    )
            );
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
        @MethodSource("regularDeleteOrderIds")
        public void deleteOrderInvalidIds(String orderId, int expectedErrorCode) {
            assertDeleteOrderInvalidId(orderId, expectedErrorCode);
        }

        @ParameterizedTest
        @MethodSource("quarantinedDeleteOrderIds")
        @Quarantine
        public void quarantinedDeleteOrderInvalidIds(String orderId, int expectedErrorCode) {
            assertDeleteOrderInvalidId(orderId, expectedErrorCode);
        }

        private void assertDeleteOrderInvalidId(String orderId, int expectedErrorCode) {
            Response response = ordersApiClient.delete(orderId);
            assertResponseCode(response, expectedErrorCode);
            assertInfoMessageFieldCode(response, expectedErrorCode);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/ErrorResponseSchema.json", response);
        }

        private static Stream<Arguments> regularDeleteOrderIds() {
            return Stream.of(
                    argumentSet(
                            "Non-existing Order ID", String.valueOf(MISSING_ORDER_ID), 404
                    )
            );
        }

        private static Stream<Arguments> quarantinedDeleteOrderIds() {
            return Stream.of(
                    argumentSet(
                            "Negative Order ID", "-1", 400
                    ),
                    argumentSet(
                            "Zero Order ID", "0", 400
                    ),
                    argumentSet(
                            "Invalid String Order ID", "INVALID", 400
                    )
            );
        }
    }

    @Nested
    class GetOrder {
        @Test
        @Quarantine
        public void getOrderValidId() {
            Response response = ordersApiClient.get(PLACED_ORDER_ID);
            assertResponseCode(response, 200);
            SchemaValidator.validateJsonSchema("schemas/OrderResponseSchema.json", response);
            assertOrderShipDateIsValid(response);
            response.then()
                    .body("id", equalTo(PLACED_ORDER_ID));
        }

        @ParameterizedTest
        @MethodSource("org.mtrusov.tests.StoreOrdersContractTests#invalidOrderIds")
        @Quarantine
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
                argumentSet(
                        "Non-existing Order ID", String.valueOf(MISSING_ORDER_ID), 404
                ),
                argumentSet(
                        "Negative Order ID", "-1", 400
                ),
                argumentSet(
                        "Zero Order ID", "0", 400
                ),
                argumentSet(
                        "Invalid String Order ID", "INVALID", 400
                )
        );
    }
}
