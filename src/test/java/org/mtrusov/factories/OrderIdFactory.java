package org.mtrusov.factories;

import java.util.concurrent.atomic.AtomicInteger;

public class OrderIdFactory {
    private static final AtomicInteger NEXT_ORDER_ID = new AtomicInteger(9000);

    private OrderIdFactory() {
    }

    public static int nextOrderId() {
        int id = NEXT_ORDER_ID.getAndIncrement();

        if (id > 9999) {
            throw new IllegalStateException("Reached max ID");
        }

        return id;
    }
}
