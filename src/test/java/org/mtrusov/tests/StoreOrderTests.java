package org.mtrusov.tests;

import io.restassured.response.Response;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.mtrusov.factories.OrderBuilder;
import org.mtrusov.factories.Orders;
import org.mtrusov.models.Order;
import org.mtrusov.models.OrderStatus;

import java.time.OffsetDateTime;

import static java.net.HttpURLConnection.*;
import static org.mtrusov.utils.AssertUtils.assertResponseCode;
import static org.mtrusov.utils.OrderAsserts.assertResponseOrderMatches;

@ResourceLock("petstore-orders")
public class StoreOrderTests extends OrdersTestsBase {

    @Test
    public void getAfterDeleteReturnsNotFound() {
        Order order = Orders.defaultOrder();
        ordersTestData.createOrderSuccess(order);
        ordersTestData.deleteOrderSuccess(order.id());
        Response getResponse = ordersApiClient.get(order.id());
        assertResponseCode(getResponse, HTTP_NOT_FOUND);
    }

    @Test
    public void getAfterCreateReturnsCreatedOrder() {
        Order order = Orders.defaultOrder();
        ordersTestData.createOrderSuccess(order);
        Response getResponse = ordersApiClient.get(order.id());
        assertResponseCode(getResponse, HTTP_OK);
        assertResponseOrderMatches(getResponse, order);
    }

    @Test
    public void deletingOrderDoesNotAffectAnotherOrder() {
        Order orderA = Orders.defaultOrder();
        ordersTestData.createOrderSuccess(orderA);
        Order orderB = Orders.defaultOrder();
        ordersTestData.createOrderSuccess(orderB);

        ordersTestData.deleteOrderSuccess(orderA.id());

        Response getResponseA = ordersApiClient.get(orderA.id());
        assertResponseCode(getResponseA, HTTP_NOT_FOUND);
        Response getResponseB = ordersApiClient.get(orderB.id());
        assertResponseCode(getResponseB, HTTP_OK);
    }

    @Test
    public void creatingAnotherOrderDoesNotOverwriteExistingOrder() {
        Order orderA = new OrderBuilder()
                .withPetId(2001)
                .withQuantity(5)
                .withShipDate(OffsetDateTime.now().minusDays(1))
                .withStatus(OrderStatus.APPROVED)
                .withComplete(false)
                .build();
        ordersTestData.createOrderSuccess(orderA);
        Order orderB = new OrderBuilder()
                .withPetId(2002)
                .withQuantity(10)
                .withShipDate(OffsetDateTime.now().minusDays(2))
                .withStatus(OrderStatus.DELIVERED)
                .withComplete(true)
                .build();
        ordersTestData.createOrderSuccess(orderB);

        Response getResponseA = ordersApiClient.get(orderA.id());
        Response getResponseB = ordersApiClient.get(orderB.id());

        assertResponseOrderMatches(getResponseA, orderA);
        assertResponseOrderMatches(getResponseB, orderB);
    }

    @Test
    public void deletedOrderCanBeCreatedAgain() {
        Order orderA = Orders.defaultOrder();
        ordersTestData.createOrderSuccess(orderA);
        ordersTestData.deleteOrderSuccess(orderA.id());

        Order orderB = new OrderBuilder()
                .withId(orderA.id())
                .withPetId(orderA.petId() + 1)
                .withQuantity(orderA.quantity() + 1)
                .withShipDate(orderA.shipDate().minusDays(1))
                .withStatus(orderA.status() == OrderStatus.PLACED ? OrderStatus.APPROVED : OrderStatus.PLACED)
                .withComplete(!orderA.complete())
                .build();
        ordersTestData.createOrderSuccess(orderB);

        Response getResponseB = ordersApiClient.get(orderB.id());
        assertResponseOrderMatches(getResponseB, orderB);
    }
}
