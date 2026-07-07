package org.mtrusov.tests;

import io.restassured.response.Response;
import org.mtrusov.api.OrdersApiClient;
import org.mtrusov.models.Order;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import static java.net.HttpURLConnection.HTTP_OK;
import static org.mtrusov.utils.AssertUtils.assertResponseCode;

public class OrdersTestData {
    private final Set<Integer> orders = ConcurrentHashMap.newKeySet();
    private final OrdersApiClient ordersApiClient;

    public OrdersTestData(OrdersApiClient ordersApiClient) {
        this.ordersApiClient = ordersApiClient;
    }

    public Response createOrderSuccess(Order order) {
        orders.add(order.id());
        Response response = ordersApiClient.placeOrder(order);
        assertResponseCode(response, HTTP_OK);
        return response;
    }

    public Response deleteOrderSuccess(int orderId) {
        orders.remove(orderId);
        Response response = ordersApiClient.delete(orderId);
        assertResponseCode(response, HTTP_OK);
        return response;
    }

    public void cleanup() {
        orders.forEach(ordersApiClient::delete);
        orders.clear();
    }
}
