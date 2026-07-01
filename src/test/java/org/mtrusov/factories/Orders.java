package org.mtrusov.factories;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

import org.mtrusov.models.Order;
import org.mtrusov.utils.OrderIdFactory;

public class Orders {
    public static Order defaultOrder() {
        return new Order(
                OrderIdFactory.nextOrderId(),
                2001,
                3,
                OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS),
                "placed",
                false);
    }
}
