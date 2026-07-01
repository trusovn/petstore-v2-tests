package org.mtrusov.models;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.OffsetDateTime;

public record Order(
        Integer id,
        Integer petId,
        Integer quantity,
        @JsonFormat(shape = JsonFormat.Shape.STRING)
        OffsetDateTime shipDate,
        OrderStatus status,
        Boolean complete
) {
}
