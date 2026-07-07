package org.mtrusov.tests;

import io.restassured.response.Response;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mtrusov.factories.Orders;
import org.mtrusov.models.Order;
import org.mtrusov.utils.SchemaValidator;

import java.util.stream.Stream;

import static java.net.HttpURLConnection.*;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.params.provider.Arguments.argumentSet;
import static org.mtrusov.utils.AssertUtils.*;
import static org.mtrusov.utils.DateTimeAsserts.assertDateTimeIsValid;
import static org.mtrusov.utils.OrderAsserts.assertResponseOrderMatches;

@ResourceLock("petstore-orders")
public class StoreOrdersContractTests extends OrdersTestsBase {
    private static final int PLACED_ORDER_ID = 1001;
    private static final int MISSING_ORDER_ID = 1010101010;

    @Nested
    class CreateOrder {
        @Test
        @Quarantine
        public void validBody() {
            Order order = Orders.defaultOrder();
            Response response = ordersTestData.createOrderSuccess(order);
            assertResponseCode(response, HTTP_OK);
            SchemaValidator.validateJsonSchema("schemas/OrderResponseSchema.json", response);
            assertOrderShipDateIsValid(response);
            assertResponseOrderMatches(response, order);
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
                            "{\"malformed\":}", HTTP_BAD_REQUEST
                    )
            );
        }

        private static Stream<Arguments> quarantinedInvalidOrders() {
            return Stream.of(
                    argumentSet(
                            "Missing request body",
                            null, HTTP_BAD_REQUEST
                    ),
                    argumentSet(
                            "Empty request body",
                            "{}", HTTP_BAD_REQUEST
                    ),
                    argumentSet(
                            "Invalid order ID",
                            Orders.defaultOrderWithModifiedField("id", "asdf"), HTTP_BAD_REQUEST
                    ),
                    argumentSet(
                            "Invalid order petId",
                            Orders.defaultOrderWithModifiedField("petId", "asdf"), HTTP_BAD_REQUEST
                    ),
                    argumentSet(
                            "Invalid order quantity",
                            Orders.defaultOrderWithModifiedField("quantity", "asdf"), HTTP_BAD_REQUEST
                    ),
                    argumentSet(
                            "Invalid order shipDate",
                            Orders.defaultOrderWithModifiedField("shipDate", "asdf"), HTTP_BAD_REQUEST
                    ),
                    argumentSet(
                            "Invalid order status",
                            Orders.defaultOrderWithModifiedField("status", "asdf"), HTTP_BAD_REQUEST
                    ),
                    argumentSet(
                            "Invalid order complete",
                            Orders.defaultOrderWithModifiedField("complete", "asdf"), HTTP_BAD_REQUEST
                    )
            );
        }
    }

    @Nested
    class DeleteOrder {
        @Test
        public void deleteOrderValidId() {
            Order order = Orders.defaultOrder();
            Response createResponse = ordersTestData.createOrderSuccess(order);
            assertResponseCode(createResponse, HTTP_OK);

            Response deleteResponse = ordersTestData.deleteOrderSuccess(order.id());
            assertResponseCode(deleteResponse, HTTP_OK);
            assertInfoMessageFieldCode(deleteResponse, HTTP_OK);
            SchemaValidator.validateJsonSchema("schemas/DeleteOrderResponseSchema.json", deleteResponse);
            assertInfoMessageFieldMessageContains(deleteResponse, order.id().toString());
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
                            "Non-existing Order ID", String.valueOf(MISSING_ORDER_ID), HTTP_NOT_FOUND
                    )
            );
        }

        private static Stream<Arguments> quarantinedDeleteOrderIds() {
            return Stream.of(
                    argumentSet(
                            "Negative Order ID", "-1", HTTP_BAD_REQUEST
                    ),
                    argumentSet(
                            "Zero Order ID", "0", HTTP_BAD_REQUEST
                    ),
                    argumentSet(
                            "Invalid String Order ID", "INVALID", HTTP_BAD_REQUEST
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
            assertResponseCode(response, HTTP_OK);
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
                        "Non-existing Order ID", String.valueOf(MISSING_ORDER_ID), HTTP_NOT_FOUND
                ),
                argumentSet(
                        "Negative Order ID", "-1", HTTP_BAD_REQUEST
                ),
                argumentSet(
                        "Zero Order ID", "0", HTTP_BAD_REQUEST
                ),
                argumentSet(
                        "Invalid String Order ID", "INVALID", HTTP_BAD_REQUEST
                )
        );
    }
}
