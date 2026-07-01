package org.mtrusov.tests;

import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mtrusov.api.OrdersApiClient;
import org.mtrusov.config.ConfigLoader;
import org.mtrusov.config.NoAuthProvider;
import org.mtrusov.factories.Orders;
import org.mtrusov.models.Order;
import org.mtrusov.utils.SchemaValidator;

import static org.mtrusov.utils.AssertUtils.assertInfoMessageFieldCode;
import static org.mtrusov.utils.AssertUtils.assertInfoMessageFieldMessageContains;
import static org.mtrusov.utils.AssertUtils.assertInfoMessageFieldMessageNoTraces;
import static org.mtrusov.utils.AssertUtils.assertResponseCode;
import static org.mtrusov.utils.DateTimeAsserts.assertDateTimeIsValid;

public class StoreOrdersContractTests {
    private static final int PLACED_ORDER_ID = 1001;
    private static final int MISSING_ORDER_ID = 1010101010;

    private static final String NOT_FOUND_MESSAGE = "not found";

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
            SchemaValidator.validateJsonSchema("schemas/OrderSchema.json", response);
            assertOrderShipDateIsValid(response);
        }

        @Test
        public void missingBody() {
            Response response = ordersApiClient.placeOrder(null);
            assertResponseCode(response, 400);
            assertInfoMessageFieldCode(response, 400);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/InfoMessageSchema.json", response);
        }

        @Test
        public void emptyBody() {
            Response response = ordersApiClient.placeOrder("{}");
            assertResponseCode(response, 400);
            assertInfoMessageFieldCode(response, 400);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/InfoMessageSchema.json", response);
        }
    }

    @Nested
    class DeleteOrder {
        @Test
        public void deleteOrderInvalidId() {
            Response response = ordersApiClient.delete("INVALID");
            assertResponseCode(response, 400);
            assertInfoMessageFieldCode(response, 400);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/InfoMessageSchema.json", response);
        }

        @Test
        public void deleteOrderNegativeId() {
            Response response = ordersApiClient.delete(-1);
            assertResponseCode(response, 400);
            assertInfoMessageFieldCode(response, 400);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/InfoMessageSchema.json", response);
        }

        @Test
        public void deleteOrderMissingId() {
            Response response = ordersApiClient.delete(MISSING_ORDER_ID);
            assertResponseCode(response, 404);
            assertInfoMessageFieldCode(response, 404);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/InfoMessageSchema.json", response);
            assertInfoMessageFieldMessageContains(response, NOT_FOUND_MESSAGE);
        }

        @Test
        public void deleteOrderValidId() {
            Order order = Orders.defaultOrder();
            Response createdOrderResponse = ordersApiClient.placeOrder(order);
            assertResponseCode(createdOrderResponse, 200);

            Response response = ordersApiClient.delete(order.id());
            assertResponseCode(response, 200);
            assertInfoMessageFieldCode(response, 200);
            SchemaValidator.validateJsonSchema("schemas/InfoMessageSchema.json", response);
            assertInfoMessageFieldMessageContains(response, order.id().toString());
        }

        @Test
        public void getOrderValidId() {
            Response response = ordersApiClient.get(PLACED_ORDER_ID);
            assertResponseCode(response, 200);
            SchemaValidator.validateJsonSchema("schemas/OrderSchema.json", response);
            assertOrderShipDateIsValid(response);
        }

    }

    @Nested
    class GetOrder {
        @Test
        public void getOrderInvalidId() {
            Response response = ordersApiClient.get("INVALID");
            assertResponseCode(response, 400);
            assertInfoMessageFieldCode(response, 400);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/InfoMessageSchema.json", response);
        }

        @Test
        public void getOrderNegativeId() {
            Response response = ordersApiClient.get(-1);
            assertResponseCode(response, 400);
            assertInfoMessageFieldCode(response, 400);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/InfoMessageSchema.json", response);
        }

        @Test
        public void getOrderNotExistingId() {
            Response response = ordersApiClient.get(MISSING_ORDER_ID);
            assertResponseCode(response, 404);
            assertInfoMessageFieldCode(response, 404);
            assertInfoMessageFieldMessageNoTraces(response);
            SchemaValidator.validateJsonSchema("schemas/InfoMessageSchema.json", response);
            assertInfoMessageFieldMessageContains(response, NOT_FOUND_MESSAGE);
        }
    }

    private static void assertOrderShipDateIsValid(Response response) {
        assertDateTimeIsValid(response, "shipDate");
    }
}
