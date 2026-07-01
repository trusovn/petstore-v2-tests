package org.mtrusov.utils;

import io.restassured.response.Response;
import org.hamcrest.Description;
import org.hamcrest.Matcher;
import org.hamcrest.TypeSafeDiagnosingMatcher;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

public class DateTimeAsserts {
    private static final Matcher<String> VALID_OFFSET_DATE_TIME_MATCHER = new ValidOffsetDateTimeMatcher();

    public static void assertDateTimeIsValid(Response response, String jsonPath) {
        response.then().body(jsonPath, VALID_OFFSET_DATE_TIME_MATCHER);
    }

    private static class ValidOffsetDateTimeMatcher extends TypeSafeDiagnosingMatcher<String> {
        @Override
        protected boolean matchesSafely(String item, Description mismatchDescription) {
            try {
                OffsetDateTime.parse(item, DateTimeFormatter.ISO_OFFSET_DATE_TIME);
                return true;
            } catch (DateTimeParseException e) {
                mismatchDescription.appendValue(item)
                        .appendText(" could not be parsed: ")
                        .appendText(e.getMessage());
                return false;
            }
        }

        @Override
        public void describeTo(Description description) {
            description.appendText("a valid ISO offset date-time");
        }
    }
}
