package org.mtrusov.utils;

import io.restassured.response.Response;

import static org.hamcrest.Matchers.*;

public class AssertUtils {
    public static void assertResponseCode(Response response, Integer expectedCode) {
        response.then().statusCode(expectedCode);
    }

    public static void assertInfoMessageFieldMessageContains(Response response, String message) {
        response.then().body("message", containsStringIgnoringCase(message));
    }

    public static void assertInfoMessageFieldCode(Response response, int code) {
        response.then().body("code", equalTo(code));
    }

    public static void assertInfoMessageFieldMessageNoTraces(Response response) {
        response.then()
                .body("message", allOf(
                   not(containsStringIgnoringCase("exception")),
                   not(containsStringIgnoringCase("java.")),
                   not(containsStringIgnoringCase("stacktrace"))
                ));
    }

}
