package org.mtrusov.tests;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;

public class OrdersTestsBase extends TestsBase {
    protected OrdersTestData ordersTestData;

    @BeforeEach
    public void beforeEach() {
        ordersTestData = new OrdersTestData(ordersApiClient);
    }

    @AfterEach
    public void afterEach() {
        ordersTestData.cleanup();
    }
}
