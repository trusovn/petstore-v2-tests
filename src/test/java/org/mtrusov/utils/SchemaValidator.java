package org.mtrusov.utils;

import io.restassured.response.Response;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;

public class SchemaValidator {
    public static void validateJsonSchema(String jsonSchemaFilePath, Response response) {
        response.then().assertThat().body(matchesJsonSchemaInClasspath(jsonSchemaFilePath));
    }
}
