package org.mtrusov.factories;

import org.mtrusov.models.Order;
import org.mtrusov.models.OrderStatus;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

public final class OrderBuilder {
    private final Field<Integer> id = new Field<>();
    private Integer petId = 2001;
    private Integer quantity = 3;
    private OffsetDateTime shipDate = OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS);
    private OrderStatus status = OrderStatus.PLACED;
    private Boolean complete = false;

    public OrderBuilder withId(Integer value) {
        this.id.set(value);
        return this;
    }

    public OrderBuilder withPetId(Integer value) {
        this.petId = value;
        return this;
    }

    public OrderBuilder withQuantity(Integer value) {
        this.quantity = value;
        return this;
    }

    public OrderBuilder withShipDate(OffsetDateTime value) {
        this.shipDate = value;
        return this;
    }

    public OrderBuilder withStatus(OrderStatus value) {
        this.status = value;
        return this;
    }

    public OrderBuilder withComplete(Boolean value) {
        this.complete = value;
        return this;
    }

    public Order build() {
        return new Order(
                id.isSet() ? id.value() : OrderIdFactory.nextOrderId(),
                petId,
                quantity,
                shipDate,
                status,
                complete
        );
    }

    private final static class Field<T> {
        private T value;
        private boolean set;

        public void set(T value) {
            this.value = value;
            set = true;
        }

        public T value() {
            return value;
        }

        public boolean isSet() {
            return set;
        }
    }
}
