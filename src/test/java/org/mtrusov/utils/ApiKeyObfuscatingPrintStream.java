package org.mtrusov.utils;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ApiKeyObfuscatingPrintStream extends PrintStream {
    private static final int VISIBLE_PREFIX_LENGTH = 4;
    private static final Pattern API_KEY = Pattern.compile(
            "(?im)(\\bapi_key[ \\t]*=[ \\t]*)([^\\r\\n]*)"
    );

    public ApiKeyObfuscatingPrintStream(PrintStream delegate) {
        super(delegate, true, StandardCharsets.UTF_8);
    }

    @Override
    public void print(String value) {
        super.print(obfuscate(value));
    }

    @Override
    public void println(String value) {
        super.println(obfuscate(value));
    }

    private String obfuscate(String value) {
        Matcher matcher = API_KEY.matcher(value);
        StringBuilder result = new StringBuilder();

        while (matcher.find()) {
            String apiKey = matcher.group(2);
            String obfuscated = apiKey.length() > VISIBLE_PREFIX_LENGTH
                    ? apiKey.substring(0, VISIBLE_PREFIX_LENGTH) + "..."
                    : "...";
            matcher.appendReplacement(
                    result,
                    Matcher.quoteReplacement(matcher.group(1) + obfuscated)
            );
        }
        return matcher.appendTail(result).toString();
    }
}
