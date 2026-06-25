package org.mtrusov.models;

import java.util.HashMap;
import java.util.Map;

public class Inventory {
    public Map<String, Integer> items;
    public Inventory() {
        items = new HashMap<>();
    }
}
