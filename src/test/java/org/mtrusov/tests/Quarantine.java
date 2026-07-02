package org.mtrusov.tests;

import org.junit.jupiter.api.Tag;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a test (or whole test class) as quarantined: known-failing and excluded
 * from the build-gating {@code regular-tests} execution. Quarantined tests still run
 * in the separate {@code quarantine-tests} execution, but their failures do not
 * fail the build. Remove this annotation once the test is fixed.
 */
@Tag("quarantine")
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface Quarantine {
}
