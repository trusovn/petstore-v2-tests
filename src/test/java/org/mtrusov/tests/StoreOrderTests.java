package org.mtrusov.tests;

import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.jspecify.annotations.NonNull;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mtrusov.api.OrdersApiClient;
import org.mtrusov.config.ConfigLoader;
import org.mtrusov.config.NoAuthProvider;
import org.mtrusov.factories.OrderBuilder;
import org.mtrusov.factories.Orders;
import org.mtrusov.models.Order;
import org.mtrusov.models.OrderStatus;

import java.time.OffsetDateTime;

import static java.net.HttpURLConnection.*;
import static org.mtrusov.utils.AssertUtils.assertResponseCode;
import static org.mtrusov.utils.OrderAsserts.assertResponseOrderMatches;

public class StoreOrderTests {
    private static OrdersApiClient ordersApiClient;

    @BeforeAll
    public static void beforeAll() {
        var apiConfig = ConfigLoader.load().storeApiConfig();
        ordersApiClient = new OrdersApiClient(apiConfig, new NoAuthProvider());

        RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();
    }

    @Test
    public void getAfterDeleteReturnsNotFound() {
        Order order = createDefaultOrder();
        deleteOrder(order);
        Response getResponse = ordersApiClient.get(order.id());
        assertResponseCode(getResponse, HTTP_NOT_FOUND);
    }

    @Test
    public void getAfterCreateReturnsCreatedOrder() {
        Order order = createDefaultOrder();
        Response getResponse = ordersApiClient.get(order.id());
        assertResponseCode(getResponse, HTTP_OK);
        assertResponseOrderMatches(getResponse, order);
    }

    @Test
    public void deletingOrderDoesNotAffectAnotherOrder() {
        Order orderA = createDefaultOrder();
        Order orderB = createDefaultOrder();

        deleteOrder(orderA);

        Response getResponseA = ordersApiClient.get(orderA.id());
        assertResponseCode(getResponseA, HTTP_NOT_FOUND);
        Response getResponseB = ordersApiClient.get(orderB.id());
        assertResponseCode(getResponseB, HTTP_OK);
    }

    @Test
    public void creatingAnotherOrderDoesNotOverwriteExistingOrder() {
        Order orderA = createOrder(new OrderBuilder()
                .withPetId(2001)
                .withQuantity(5)
                .withShipDate(OffsetDateTime.now().minusDays(1))
                .withStatus(OrderStatus.APPROVED)
                .withComplete(false)
                .build());
        Order orderB = createOrder(new OrderBuilder()
                .withPetId(2002)
                .withQuantity(10)
                .withShipDate(OffsetDateTime.now().minusDays(2))
                .withStatus(OrderStatus.DELIVERED)
                .withComplete(true)
                .build());

        Response getResponseA = ordersApiClient.get(orderA.id());
        Response getResponseB = ordersApiClient.get(orderB.id());

        assertResponseOrderMatches(getResponseA, orderA);
        assertResponseOrderMatches(getResponseB, orderB);
    }

    @Test
    public void deletedOrderCanBeCreatedAgain() {
        Order orderA = createDefaultOrder();
        deleteOrder(orderA);

        Order orderB = createOrder(new OrderBuilder()
                .withId(orderA.id())
                .withPetId(orderA.petId() + 1)
                .withQuantity(orderA.quantity() + 1)
                .withShipDate(orderA.shipDate().minusDays(1))
                .withStatus(orderA.status() == OrderStatus.PLACED ? OrderStatus.APPROVED : OrderStatus.PLACED)
                .withComplete(!orderA.complete())
                .build());

        Response getResponseB = ordersApiClient.get(orderB.id());
        assertResponseOrderMatches(getResponseB, orderB);
    }

    private static void deleteOrder(Order orderA) {
        Response deletedResponse = ordersApiClient.delete(orderA.id());
        assertResponseCode(deletedResponse, HTTP_OK);
    }

    private static @NonNull Order createDefaultOrder() {
       return createOrder(Orders.defaultOrder());
    }

    private static @NonNull Order createOrder(Order order) {
        Response createdResponse = ordersApiClient.placeOrder(order);
        assertResponseCode(createdResponse, HTTP_OK);
        return order;
    }
}
