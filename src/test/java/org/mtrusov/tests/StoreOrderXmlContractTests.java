package org.mtrusov.tests;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mtrusov.api.OrdersApiClient;
import org.mtrusov.api.Specifications;
import org.mtrusov.config.NoAuthProvider;
import org.mtrusov.models.OrderStatus;

import static java.net.HttpURLConnection.HTTP_OK;
import static org.hamcrest.Matchers.equalTo;
import static org.mtrusov.utils.AssertUtils.assertResponseCode;

public class StoreOrderXmlContractTests extends TestsBase {
    private static final int PLACED_ORDER_ID = 1001;

    private OrdersApiClient ordersXmlClient;

    @BeforeEach
    void setUpXmlClient() {
        ordersXmlClient = new OrdersApiClient(
                Specifications.getRequestSpecification(apiConfig, ContentType.XML, ContentType.JSON, new NoAuthProvider()),
                Specifications.getResponseSpecification(ContentType.XML)
        );
    }

    @Test
    void getOrderCanReturnXmlWhenXmlIsRequested() {
        Response response = ordersXmlClient.get(PLACED_ORDER_ID);
        assertResponseCode(response, HTTP_OK);
        response.then()
                .contentType(ContentType.XML)
                .body("Order.id", equalTo(String.valueOf(PLACED_ORDER_ID)))
                .body("Order.petId", equalTo("2001"))
                .body("Order.quantity", equalTo("2"))
                .body("Order.status", equalTo(OrderStatus.PLACED.value()));
    }
}
