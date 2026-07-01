package org.mtrusov.factories;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.mtrusov.models.Order;

public class Orders {
    private static final ObjectMapper JSON_MAPPER = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .build();

    public static Order defaultOrder() {
        return new OrderBuilder().build();
    }

    public static ObjectNode defaultOrderWithout(String... fields) {
        ObjectNode json = JSON_MAPPER.valueToTree(defaultOrder());
        for (String field : fields) {
            json.remove(field);
        }
        return json;
    }

    public static ObjectNode defaultOrderWithModifiedField(String field, Object value) {
        ObjectNode json = JSON_MAPPER.valueToTree(defaultOrder());
        json.set(field, JSON_MAPPER.valueToTree(value));
        return json;
    }
}
