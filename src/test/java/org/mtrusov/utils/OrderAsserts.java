package org.mtrusov.utils;

import io.restassured.response.Response;
import org.hamcrest.CustomTypeSafeMatcher;
import org.hamcrest.Matcher;
import org.mtrusov.models.Order;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;

import static java.time.temporal.ChronoUnit.MILLIS;
import static org.hamcrest.Matchers.equalTo;

public class OrderAsserts {
    private static final DateTimeFormatter COMPACT_OFFSET_DATE_TIME_FORMATTER =
            new DateTimeFormatterBuilder()
                    .append(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                    .appendOffset("+HHMM", "Z")
                    .toFormatter();

    public static void assertResponseOrderMatches(Response response, Order order) {
        response.then()
                .body("id", equalTo(order.id()))
                .body("petId", equalTo(order.petId()))
                .body("quantity", equalTo(order.quantity()))
                .body("shipDate", sameInstantToMillisecondPrecisionAs(order.shipDate()))
                .body("status", equalTo(order.status().value()))
                .body("complete", equalTo(order.complete()));
    }

    private static Matcher<String> sameInstantToMillisecondPrecisionAs(OffsetDateTime expected) {
        return new CustomTypeSafeMatcher<>("same instant to millisecond precision as " + expected) {
            @Override
            protected boolean matchesSafely(String actual) {
                try {
                    return normalizedInstant(parseOffsetDateTime(actual))
                            .equals(normalizedInstant(expected));
                } catch (DateTimeParseException exception) {
                    return false;
                }
            }
        };
    }

    private static Instant normalizedInstant(OffsetDateTime value) {
        return value.toInstant().truncatedTo(MILLIS);
    }

    private static OffsetDateTime parseOffsetDateTime(String value) {
        try {
            return OffsetDateTime.parse(value);
        } catch (DateTimeParseException exception) {
            return OffsetDateTime.parse(value, COMPACT_OFFSET_DATE_TIME_FORMATTER);
        }
    }
}
