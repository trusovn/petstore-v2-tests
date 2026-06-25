package org.mtrusov.factories;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

import org.mtrusov.models.Order;

public class Orders {
    public static Order defaultOrder() {
        return new Order(
                1,
                2,
                3,
                OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS),
                "placed",
                false);
    }
}
